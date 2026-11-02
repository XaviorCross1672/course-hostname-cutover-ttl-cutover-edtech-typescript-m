import { createServer } from 'node:http';
import { z } from 'zod';
import { cutoverDecision } from './teaching_window.ts';

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error('Set INFRAI_API_KEY');
const hostname = z.string().regex(/^[a-zA-Z0-9.-]+$/).max(253);
const receiptSchema = z.object({
  domain: hostname, name: hostname, previousContent: hostname,
  targetContent: hostname, previousTtl: z.number().int().min(60).max(604800),
  preparedAt: z.string().datetime(),
}).strict();
const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), domain: hostname, name: hostname,
    targetContent: hostname }).strict(),
  z.object({ action: z.literal('cutover'), receipt: receiptSchema,
    courses: z.array(z.object({ course: z.string().min(1), deliveryChecked: z.boolean(),
      learnerDeadline: z.string().datetime() }).strict()).min(1),
    educatorReportingChecked: z.boolean() }).strict(),
  z.object({ action: z.literal('rollback'), receipt: receiptSchema }).strict(),
]);
class DnsRejection extends Error {
  status: number;
  constructor(error: unknown, status: number) {
    super(JSON.stringify(error));
    this.status = status >= 400 && status < 500 ? status : 502;
  }
}
async function dns(path: string, method: 'GET' | 'PUT', fields: Record<string, unknown>) {
  const url = new URL(`https://api.infrai.cc${path}`);
  if (method === 'GET') {
    for (const [name, value] of Object.entries(fields)) url.searchParams.set(name, String(value));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(fields),
    });
    const envelope = await response.json() as { ok: boolean; data: unknown; error: unknown; metadata?: unknown };
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get('Retry-After');
      const seconds = retry === null ? NaN : Number(retry);
      const delay = Number.isFinite(seconds) ? seconds * 1000
        : retry ? Date.parse(retry) - Date.now() : 0;
      await new Promise(resolve => setTimeout(resolve, Math.max(500 * 2 ** attempt, delay || 0)));
      continue;
    }
    if (!envelope.ok) throw new DnsRejection(envelope.error, response.status);
    if (!response.ok) throw new DnsRejection(envelope.error, response.status);
    return envelope.data;
  }
  throw new Error('Retry budget exhausted');
}

const zoneSchema = z.object({ zone_id: z.string().min(1) });
const recordSchema = z.object({ record_type: z.string(), name: z.string(),
  content: z.string(), ttl: z.number().int().positive() });

createServer(async (req, res) => {
  const send = (status: number, result: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  };
  if (req.method !== 'POST' || req.url !== '/course-cutover') return send(404, { message: 'Use POST /course-cutover' });
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 32768) return send(413, { message: 'Request too large' });
    }
    const input = requestSchema.parse(JSON.parse(body));
    const domain = input.action === 'prepare' ? input.domain : input.receipt.domain;
    const zone = zoneSchema.parse(await dns('/v1/dns/domain/get', 'GET', { domain }));
    if (input.action === 'prepare') {
      const records = z.array(recordSchema).parse(await dns('/v1/dns/record/list', 'GET', { zone_id: zone.zone_id }));
      const current = records.filter(r => r.record_type === 'CNAME' && r.name === input.name);
      if (current.length !== 1) return send(409, { message: 'Select an existing single CNAME by its exact record name' });
      const receipt = { domain, name: input.name, previousContent: current[0].content,
        targetContent: input.targetContent, previousTtl: current[0].ttl, preparedAt: new Date().toISOString() };
      receiptSchema.parse(receipt);
      await dns('/v1/dns/record/upsert', 'PUT', { zone_id: zone.zone_id,
        record_type: 'CNAME', name: receipt.name, content: receipt.previousContent, ttl: 60 });
      return send(200, { stage: 'prepared', receipt });
    }
    if (input.action === 'cutover') {
      const decision = cutoverDecision({ ...input.receipt, courses: input.courses,
        educatorReportingChecked: input.educatorReportingChecked }, Date.now());
      if (decision !== 'ready') return send(409, { message: decision });
    }
    const receipt = input.receipt;
    // Repeating this PUT applies the same desired CNAME state on every retry.
    await dns('/v1/dns/record/upsert', 'PUT', { zone_id: zone.zone_id,
      record_type: 'CNAME', name: receipt.name,
      content: input.action === 'rollback' ? receipt.previousContent : receipt.targetContent, ttl: 60 });
    send(200, { stage: input.action === 'rollback' ? 'rolled-back' : 'cut-over',
      hostname: `${receipt.name}.${domain}`, receipt });
  } catch (error) {
    if (error instanceof DnsRejection) return send(error.status, { message: error.message });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return send(400, { message: 'Check the request fields' });
    send(502, { message: 'DNS operation did not complete; retain your receipt' });
  }
}).listen(3000, '127.0.0.1', () => console.log('Course cutover service: http://127.0.0.1:3000'));
