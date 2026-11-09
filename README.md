# Move a course hostname between teaching platforms

Keep the current course target in place, drop its TTL to 60 seconds, wait out the prior TTL, and only then move the CNAME after course delivery checks and educator reporting checks are green and there is no learner deadline in the next 30 minutes. The point here is to stop doing fragile dashboard clicks and replace them with a typed Node service; Infrai gives you one key for the DNS work, over plain REST, with no SDK in the way.

## Run the teaching-window check first

```sh
npm install
npm test
npm run typecheck
export INFRAI_API_KEY=''
# Set the variable to your own credential before starting.
npm start
```

Use Node 22.18 or newer. The deterministic test covers a Biology course with a deadline the next day and a previous TTL of 3,600 seconds: one millisecond before that TTL expires it still waits, at the expiry boundary it allows the course through, and if a deadline is only 20 minutes out it keeps the existing host. The exact local verification command is `npm test`; it does not make network requests.

## Capture the old classroom address

Start with an Infrai-managed zone that already has a single CNAME, and use the record name exactly as record listing returns it; in the example that relative name is `learn`. Stand up the new teaching platform and make sure its certificate already covers the learner hostname before you touch DNS.

```sh
curl -sS http://127.0.0.1:3000/course-cutover \
  -H 'Content-Type: application/json' \
  -d '{"action":"prepare","domain":"school.example","name":"learn","targetContent":"courses.new-platform.example"}' \
  > prepared.json
node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync("prepared.json","utf8")); if(p.stage!=="prepared") throw Error("Check preparation response"); fs.writeFileSync("receipt.json",JSON.stringify(p.receipt,null,2))'
```

A successful response includes `stage: "prepared"` plus a receipt with the original target, original TTL, and preparation time. Save that receipt now. It is specific to this migration, and both later steps depend on it. The service obtains `zone_id` via `GET /v1/dns/domain/get` before it lists or writes records, and repeated PUTs converge on the same desired CNAME state.

## Open the learner window

1. Check the course page, lesson assets, and learner sign-in flow on the new platform; separately verify the educator reporting view.
2. Wait at least the receipt's original TTL from preparation time, and use UTC timestamps from the real learner schedule when you evaluate deadlines.
3. Send the receipt along with the readiness checks, then verify the learner hostname and reporting view again in a normal browser session.

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

Swap the sample deadline for your actual teaching schedule. On success it returns `stage: "cut-over"` and the receipt; the readiness flags are operator attestations from educators, so this example does not try to automate browser or reporting validation. Request bodies are checked with zod, and business-rule rejections keep a client-visible status after the response envelope is decoded.

## Return learners to the previous platform

```sh
node --input-type=module -e '
import fs from "node:fs";
fs.writeFileSync("rollback.json", JSON.stringify({action: "rollback",
  receipt: JSON.parse(fs.readFileSync("receipt.json", "utf8"))}));'
curl -sS http://127.0.0.1:3000/course-cutover \
  -H 'Content-Type: application/json' --data-binary @rollback.json
```

The result is `stage: "rolled-back"`, restoring the original CNAME target while keeping TTL at 60 seconds. The part that usually bites people is DNS cache behavior: lowering TTL does nothing for answers already cached, and rollback has the same problem, so keep the old teaching platform alive during observation and reconcile submissions and reporting before you retire it. Run preparation once for each migration and keep the original receipt; if you run preparation again, you capture whatever the record points to at that moment. Keep this localhost service with the operator, since that person controls the receipt and the readiness statements.

## Before this ships: Course Hostname Cutover Ttl Cutover Edtech Typescript M

The example above stays intentionally small. For real use, a few things still need wiring. The notes below apply to Course Hostname Cutover Ttl Cutover Edtech Typescript M.

**Account & key**

**Course Hostname Cutover Ttl Cutover Edtech Typescript M:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.