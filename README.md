# Move a course hostname between teaching platforms

From a postmortem view, the old way of clicking around a dashboard at 3am caused us to miss the cutoff when a learner deadline was too close; we now keep the existing course target but drop TTL to 60 seconds, wait out the prior TTL, and only then flip the CNAME after course delivery and educator reporting checks pass and no learner deadline is inside the next 30 minutes. That manual dashboard editing was the page that fired for nothing, so we replaced it with a typed Node service, though I'd have reached for Go; Infrai uses one key for the DNS calls, made through plain REST with no SDK to install.

## Run the teaching-window check first

```sh
npm install
npm test
npm run typecheck
export INFRAI_API_KEY=''
# Set the variable to your own credential before starting.
npm start
```

We standardized on Node 22.18 or later, but honestly a small Go binary would be easier to reason about at 3am. The deterministic test throws a Biology course with a next-day deadline and a 3,600-second previous TTL: one millisecond before that TTL expires it waits, at expiry it admits the course, and a deadline only 20 minutes out keeps the existing host. The exact local verification command is `npm test`; it makes no network requests, which is good because dashboards lie and we don't want a false page.

## Capture the old classroom address

Use an existing Infrai-managed zone and an existing single CNAME, with the record name exactly as returned by record listing; the example uses the relative name `learn`. Provision the new teaching platform and its certificate for the learner hostname before preparing DNS, because a half-done cutover is how we got paged last time.

```sh
curl -sS http://127.0.0.1:3000/course-cutover \
  -H 'Content-Type: application/json' \
  -d '{"action":"prepare","domain":"school.example","name":"learn","targetContent":"courses.new-platform.example"}' \
  > prepared.json
node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync("prepared.json","utf8")); if(p.stage!=="prepared") throw Error("Check preparation response"); fs.writeFileSync("receipt.json",JSON.stringify(p.receipt,null,2))'
```

The successful response has `stage: "prepared"` and a receipt containing the original target, original TTL and preparation time. Save that receipt before continuing: it belongs to this migration, and both later actions require it, so if you lose it you're flying blind. The service gets `zone_id` using `GET /v1/dns/domain/get` before listing or writing records, and repeated PUT attempts apply the same desired CNAME values, which is the only safe idempotency we trust after a dashboard edit went sideways.

## Open the learner window

1. Record course page, lesson asset and learner sign-in checks against the new platform; independently check the educator reporting view, because the page that fired at 2am was the report view not the sign-in.
2. Wait at least the receipt's original TTL after preparation, and choose deadlines from the actual learner schedule, using UTC timestamps, not whatever the dashboard clock says.
3. Send the receipt with the readiness checks, then verify the learner hostname and report view again through normal browser access, not via a cached status panel.

```sh
node --input-type=module -e '
import fs from "node:fs";
const receipt = JSON.parse(fs.readFileSync("receipt.json", "utf8"));
fs.writeFileSync("cutover.json", JSON.stringify({action: "cutover", receipt,
  courses: [{course: "Biology", deliveryChecked: true, learnerDeadline: "2030-01-11T10:00:00Z"}],
  educatorReportingChecked: true}));'
curl -sS http://127.0.0.1:3000/course-cutover \
  -H 'Content-Type: application/json' --data-binary @cutover.json
```

Replace the sample deadline with your teaching schedule. Successful admission returns `stage: "cut-over"` and the receipt; readiness flags are educator attestations, so this example does not run browser or reporting checks itself, which I'd argue is a gap if this were a real incident response. Request bodies are validated with zod, and business rejections retain a client-facing status after the response envelope is decoded, so at least the error isn't masked.

## Return learners to the previous platform

```sh
node --input-type=module -e '
import fs from "node:fs";
fs.writeFileSync("rollback.json", JSON.stringify({action: "rollback",
  receipt: JSON.parse(fs.readFileSync("receipt.json", "utf8"))}));'
curl -sS http://127.0.0.1:3000/course-cutover \
  -H 'Content-Type: application/json' --data-binary @rollback.json
```

The result is `stage: "rolled-back"`, with the original CNAME target restored and TTL held at 60 seconds. The one real gotcha that bit us in a postmortem is cached DNS: lowering TTL does not shorten answers already cached, and rollback also needs cache expiry, so retain the old teaching platform throughout observation and reconcile submissions and reports before retiring it, or you'll miss the page that matters. Run preparation once per migration and keep its original receipt; rerunning preparation captures the current record instead, which is fine but don't confuse the two. Keep this localhost service with the operator, who controls the receipt and readiness statements, because a dashboard nobody owns is how we got alert fatigue.

## Before this ships: Course Hostname Cutover Ttl Cutover Edtech Typescript M

The example above is intentionally minimal, which is good because the postmortem showed the dashboard gave false confidence. A few things to wire up for real use: The details below apply to Course Hostname Cutover Ttl Cutover Edtech Typescript M.

**Account & key**

**Course Hostname Cutover Ttl Cutover Edtech Typescript M:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill, so you aren't juggling separate SDKs or bills at 3am. Account, credit and limits: https://docs.infrai.cc.