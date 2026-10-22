// Provenance for the generated fixtures in this folder. Run once with `node characterization/fixtures/_generate.mjs`.
// Everything is derived deterministically from the upstream fixtures in e2e/fixtures (no randomness, no clock).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const up = (n) => JSON.parse(fs.readFileSync(path.join(here, "../../e2e/fixtures", n), "utf8"));
const out = (n, v) => fs.writeFileSync(path.join(here, n), JSON.stringify(v, null, 2) + "\n");

// Frozen "now" used by the harness: 2026-03-15T12:00:00Z
const NOW = Date.parse("2026-03-15T12:00:00.000Z");
const types = ["feature_value_compute_workflow", "Do_While_Workflow_Iteration_Fix", "19test009"];
const statuses = ["COMPLETED", "FAILED", "RUNNING", "TERMINATED", "COMPLETED", "TIMED_OUT", "PAUSED"];
const hex = (n) => n.toString(16).padStart(4, "0");

// 1. Workflow search: 45 executions, newest first.
const wf = [];
for (let i = 0; i < 45; i++) {
  const start = NOW - (i + 1) * 3_600_000;
  const status = statuses[i % statuses.length];
  const done = status === "RUNNING" || status === "PAUSED";
  wf.push({
    workflowType: types[i % types.length],
    version: 1 + (i % 2),
    workflowId: `00000000-0000-4000-8000-${"0".repeat(8)}${hex(i + 1)}`,
    correlationId: i % 5 === 0 ? `corr-${hex(i)}` : undefined,
    startTime: new Date(start).toISOString(),
    updateTime: new Date(start + 5_000).toISOString(),
    endTime: done ? undefined : new Date(start + 4_000).toISOString(),
    status,
    input: `{orderId=${1000 + i}, region=eu-west-${(i % 3) + 1}}`,
    output: done ? undefined : `{result=${i * 7}}`,
    reasonForIncompletion: status === "FAILED" ? `Task failed at step ${i}` : undefined,
    executionTime: done ? 0 : 4000,
    priority: 0,
  });
}
out("workflowSearchLarge.json", wf);

// 2. Task search: 30 task executions.
const base = up("taskSearch.json").results[0];
const tt = ["SIMPLE", "HTTP", "LAMBDA"];
const tn = ["example_task_1", "example_task_2", "example_task_3"];
const tasks = [];
for (let i = 0; i < 30; i++) {
  const start = NOW - (i + 1) * 1_800_000;
  tasks.push({
    ...base,
    workflowId: `00000000-0000-4000-8000-${"0".repeat(8)}${hex(i + 1)}`,
    workflowType: types[i % types.length],
    scheduledTime: new Date(start - 1000).toISOString(),
    startTime: new Date(start).toISOString(),
    updateTime: new Date(start + 400).toISOString(),
    endTime: new Date(start + 400).toISOString(),
    status: ["COMPLETED", "FAILED", "IN_PROGRESS"][i % 3],
    taskDefName: tn[i % 3],
    taskType: tt[i % 3],
    taskId: `00000000-0000-4000-9000-${"0".repeat(8)}${hex(i + 1)}`,
    input: `{n=${i}}`,
    output: `{ok=true}`,
  });
}
out("taskSearchLarge.json", { totalHits: tasks.length, results: tasks });

// 3. Executions derived from the upstream dynamic-fork ones.
const ok = up("dynamicFork/success.json");
const running = JSON.parse(JSON.stringify(ok));
running.workflowId = "11111111-1111-4111-8111-111111111111";
running.status = "RUNNING";
delete running.endTime;
running.tasks = running.tasks.slice(0, 2);
running.tasks[1].status = "IN_PROGRESS";
delete running.tasks[1].endTime;
out("executionRunning.json", running);

const child = JSON.parse(JSON.stringify(ok));
child.workflowId = "22222222-2222-4222-8222-222222222222";
child.parentWorkflowId = ok.workflowId;
child.parentWorkflowTaskId = ok.tasks[0].taskId;
out("executionWithParent.json", child);

// 4. Task logs.
out("taskLog.json", [
  { log: "worker picked up the task", createdTime: NOW - 120_000, taskId: ok.tasks[1].taskId },
  { log: "processing batch 1 of 2", createdTime: NOW - 90_000, taskId: ok.tasks[1].taskId },
  { log: "done", createdTime: NOW - 60_000, taskId: ok.tasks[1].taskId },
]);

// 5. Execution with a SUB_WORKFLOW task (links to the sub workflow's definition and execution).
const withSub = JSON.parse(JSON.stringify(ok));
withSub.workflowId = "44444444-4444-4444-8444-444444444444";
const subTask = withSub.tasks[1];
subTask.taskType = "SUB_WORKFLOW";
subTask.workflowTask.type = "SUB_WORKFLOW";
subTask.workflowTask.subWorkflowParam = { name: "child_workflow", version: 1 };
subTask.subWorkflowId = "22222222-2222-4222-8222-222222222222";
out("executionWithSubWorkflow.json", withSub);
