/**
 * One test per route state: visit the URL with fixture data, assert the document title, key visible
 * text, the set of API calls the page makes, that the URL was not rewritten, and a full-page screenshot.
 * The route table is documented in case/routes.md.
 */
import type { Page } from "@playwright/test";
import { test, expect, settle, pathAndSearch, type ApiMock } from "./support/harness";

const EXEC_OK = "e66254b6-388d-43a6-b890-c518df832e51";
const EXEC_FAILED = "d4b14434-73a7-4be9-b085-d4b40b30856e";

const editorReady = async (page: Page) => {
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(/\w/);
  // The workflow editor also lays out a diagram next to the editor; let that finish, otherwise
  // the diagram (orkes-workflow-visualizer) sometimes logs a "Layout Error" when the page changes under it.
  if (new URL(page.url()).pathname.startsWith("/workflowDef")) {
    await expect(page.getByText("End", { exact: true })).toBeVisible();
  }
};

/** Monaco is mounted but the document is empty (see case/followups.md: new scheduler template never loads). */
const editorMountedEmpty = async (page: Page) => {
  await expect(page.locator(".monaco-editor .view-lines").first()).toBeVisible();
  await page.waitForTimeout(500);
};

interface Case {
  name: string;
  url: string;
  title: string;
  /** visible text that must be present */
  texts?: Array<string | RegExp>;
  /** distinct "METHOD /path" API calls (query ignored) the page makes, sorted */
  calls: string[];
  ready?: (page: Page) => Promise<void>;
  setup?: (api: ApiMock) => void;
  /** URL after load, when different from `url` (never the case in the old app) */
  finalUrl?: string;
  expectedConsoleErrors?: string[];
  mask?: (page: Page) => import("@playwright/test").Locator[];
}

const cases: Case[] = [
  {
    name: "workflow-search",
    url: "/",
    title: "Conductor UI",
    texts: ["Search Executions", "Page 1 of 3", "feature_value_compute_workflow"],
    calls: ["GET /metadata/workflow/names", "GET /workflow/search"],
  },
  {
    name: "workflow-search-executions",
    url: "/executions",
    title: "Conductor UI",
    texts: ["Search Executions", "Page 1 of 3"],
    calls: ["GET /metadata/workflow/names", "GET /workflow/search"],
  },
  {
    name: "task-search",
    url: "/search/tasks?taskName=example_task_2",
    title: "Conductor UI",
    texts: ["Search Executions", "Task Name", "Page 1 of 1"],
    calls: ["GET /metadata/taskdefs", "GET /metadata/workflow/names", "GET /tasks/search"],
  },
  {
    name: "task-search-no-filter",
    url: "/search/tasks",
    title: "Conductor UI",
    texts: ["Search Executions", "There are no records to display"],
    calls: ["GET /metadata/taskdefs", "GET /metadata/workflow/names"],
  },
  {
    name: "execution-diagram",
    url: `/execution/${EXEC_OK}`,
    title: `Conductor UI - Execution - ${EXEC_OK}`,
    texts: ["example_dynamic_tasks", "COMPLETED", "Diagram", "Task List", "Timeline", "join_dynamic"],
    calls: [`GET /workflow/${EXEC_OK}`],
    ready: async (page) => {
      await expect(page.getByText("End", { exact: true })).toBeVisible();
    },
  },
  {
    name: "execution-summary-tab",
    url: `/execution/${EXEC_OK}?tabIndex=1`,
    title: `Conductor UI - Execution - ${EXEC_OK}`,
    texts: ["Workflow ID", "Duration", "762ms"],
    calls: [`GET /workflow/${EXEC_OK}`],
  },
  {
    name: "execution-input-output-tab",
    url: `/execution/${EXEC_OK}?tabIndex=2`,
    title: `Conductor UI - Execution - ${EXEC_OK}`,
    texts: ["Workflow Input/Output"],
    calls: [`GET /workflow/${EXEC_OK}`],
  },
  {
    name: "execution-json-tab",
    url: `/execution/${EXEC_OK}?tabIndex=3`,
    title: `Conductor UI - Execution - ${EXEC_OK}`,
    texts: ["JSON"],
    calls: [`GET /workflow/${EXEC_OK}`],
  },
  {
    name: "execution-selected-task-drawer",
    url: `/execution/${EXEC_OK}?task=(ref:first_task)`,
    title: `Conductor UI - Execution - ${EXEC_OK}`,
    texts: ["Summary", "Input", "Output", "Logs", "JSON", "Definition"],
    calls: [`GET /workflow/${EXEC_OK}`],
    ready: async (page) => {
      await expect(page.getByRole("button", { name: "Close sidebar" }).or(page.getByLabel("Close sidebar"))).toBeVisible();
    },
  },
  {
    name: "execution-failed",
    url: `/execution/${EXEC_FAILED}`,
    title: `Conductor UI - Execution - ${EXEC_FAILED}`,
    texts: ["FAILED"],
    calls: [`GET /workflow/${EXEC_FAILED}`],
    ready: async (page) => {
      await expect(page.getByText("End", { exact: true })).toBeVisible();
    },
  },
  {
    name: "execution-not-found",
    url: "/execution/nope",
    title: "Conductor UI - Execution - nope",
    calls: ["GET /workflow/nope"],
    // react-query retries a failing query 3 times (1s, 2s, 4s) before giving up
    ready: async (page) => {
      await expect(page.getByText("Refresh")).toHaveCount(0);
      await page.waitForTimeout(8000);
    },
    expectedConsoleErrors: ["Failed to load resource", "No such workflow found by id: nope"],
  },
  {
    name: "workflow-defs",
    url: "/workflowDefs",
    title: "Conductor UI - Workflow Definitions",
    texts: ["Definitions", "New Workflow Definition", "3 results", "19test009", "Do_While_Workflow_Iteration_Fix"],
    calls: ["GET /metadata/workflow"],
  },
  {
    name: "workflow-def-existing",
    url: "/workflowDef/19test009",
    title: "Conductor UI - Workflow Definition - 19test009",
    texts: ["Latest Version", "Unmodified", "Save", "Reset"],
    calls: ["GET /metadata/workflow/19test009", "GET /metadata/workflow/19test009/versions", "GET /metadata/workflow/names"],
    ready: editorReady,
  },
  {
    name: "workflow-def-version",
    url: "/workflowDef/19test009/1",
    title: "Conductor UI - Workflow Definition - 19test009",
    texts: ["Version 1", "Unmodified"],
    calls: ["GET /metadata/workflow/19test009", "GET /metadata/workflow/19test009/versions", "GET /metadata/workflow/names"],
    ready: editorReady,
  },
  {
    name: "workflow-def-new",
    url: "/workflowDef",
    title: "Conductor UI - Workflow Definition - New Workflow",
    texts: ["NEW", "Latest Version", "Unmodified", "Save", "Reset"],
    calls: ["GET /metadata/workflow/names"],
    ready: editorReady,
  },
  {
    name: "task-defs",
    url: "/taskDefs",
    title: "Conductor UI - Task Definitions",
    texts: ["New Task Definition", "3 results", "example_task_1", "example_task_2", "example_task_3"],
    calls: ["GET /metadata/taskdefs"],
  },
  {
    name: "task-def-existing",
    url: "/taskDef/example_task_1",
    title: "Conductor UI - Task Definition - example_task_1",
    texts: ["Unmodified", "Save", "Reset"],
    calls: ["GET /metadata/taskdefs", "GET /metadata/taskdefs/example_task_1"],
    ready: editorReady,
  },
  {
    name: "task-def-new",
    url: "/taskDef",
    title: "Conductor UI - Task Definition - New Task",
    texts: ["NEW", "Unmodified"],
    calls: ["GET /metadata/taskdefs"],
    ready: editorReady,
  },
  {
    name: "event-handler-defs",
    url: "/eventHandlerDefs",
    title: "Conductor UI - Event Handler Definitions",
    texts: ["New Event Handler Definition", "2 results", "test_event_handler", "conductor:workflow:COMPLETED"],
    calls: ["GET /event"],
  },
  {
    name: "event-handler-def-existing",
    url: "/eventHandlerDef/conductor:workflow:COMPLETED/test_event_handler",
    title: "Conductor UI - Event Handler Definition - test_event_handler",
    texts: ["test_event_handler", "Unmodified"],
    calls: ["GET /event", "GET /event/conductor:workflow:COMPLETED"],
    ready: editorReady,
  },
  {
    name: "event-handler-def-new",
    url: "/eventHandlerDef",
    title: "Conductor UI - Event Handler Definition - New Event Handler",
    texts: ["NEW", "Unmodified"],
    calls: ["GET /event"],
    ready: editorReady,
  },
  {
    name: "scheduler-defs",
    url: "/schedulerDefs",
    title: "Conductor UI - Scheduler Definitions",
    texts: ["New Schedule", "2 results", "daily_cleanup_schedule", "hourly_data_sync"],
    calls: ["GET /scheduler/schedules"],
  },
  {
    name: "scheduler-defs-disabled",
    url: "/schedulerDefs",
    title: "Conductor UI - Scheduler Definitions",
    setup: (api) =>
      api.on("GET", "/scheduler/schedules", { status: 404, json: { status: 404, message: "Not Found" } }),
    texts: ["Scheduler is not enabled", "conductor.scheduler.enabled=true"],
    calls: ["GET /scheduler/schedules"],
    // react-query retries a failing query 3 times before the banner path settles
    ready: async (page) => {
      await page.waitForTimeout(8000);
    },
    expectedConsoleErrors: ["Failed to load resource", "\"status\":404"],
  },
  {
    name: "scheduler-def-existing",
    url: "/schedulerDef/daily_cleanup_schedule",
    title: "Conductor UI - Schedule Definition - daily_cleanup_schedule",
    texts: ["daily_cleanup_schedule", "Unmodified"],
    calls: ["GET /scheduler/schedules/daily_cleanup_schedule"],
    ready: editorReady,
  },
  {
    name: "scheduler-def-new",
    url: "/schedulerDef",
    title: "Conductor UI - Schedule Definition - New Schedule",
    texts: ["NEW", "Unmodified"],
    calls: [],
    ready: editorMountedEmpty,
  },
  {
    name: "scheduler-executions",
    url: "/schedulerExecs",
    title: "Conductor UI",
    texts: ["Scheduler Executions", "Schedule Name", "exec-abc123", "EXECUTED"],
    calls: ["GET /metadata/workflow/names", "GET /scheduler/schedules", "GET /scheduler/search/executions"],
  },
  {
    name: "task-queue",
    url: "/taskQueue",
    title: "Conductor UI - Task Queue",
    texts: ["Task Queues", "Select a Task Name"],
    calls: ["GET /metadata/taskdefs"],
  },
  {
    name: "task-queue-selected",
    url: "/taskQueue/example_task_1",
    title: "Conductor UI - Task Queue",
    texts: ["Poll Status by Domain", "worker-host-1", "DEFAULT"],
    calls: ["GET /metadata/taskdefs", "GET /tasks/queue/polldata", "GET /tasks/queue/size"],
  },
  {
    name: "workbench",
    url: "/workbench",
    title: "Conductor UI - Workbench",
    texts: ["Run History", "No saved runs.", "Workflow Workbench", "Workflow Name", "Execution History", "No execution history."],
    calls: ["GET /metadata/workflow/names"],
  },
  {
    name: "kitchen",
    url: "/kitchen",
    title: "Conductor UI",
    texts: ["This is a Hawkins-like theme based on vanilla Material-UI.", "Heading Level Zero"],
    calls: [],
  },
  {
    name: "kitchen-diagram",
    url: "/kitchen/diagram",
    title: "Conductor UI",
    texts: ["Shortcut: Ctrl + scroll to zoom", "fork_join (fork)"],
    calls: [],
  },
  {
    name: "kitchen-examples",
    url: "/kitchen/examples",
    title: "Conductor UI",
    calls: [],
  },
  {
    name: "kitchen-gantt",
    url: "/kitchen/gantt",
    title: "Conductor UI",
    texts: ["This example demonstrate using groups.", "item 0", "group 0"],
    calls: [],
  },
  {
    name: "unknown-route",
    url: "/no/such/page",
    title: "Conductor UI",
    texts: ["Executions", "Definitions", "Scheduler", "Task Queues", "Workbench"],
    calls: [],
  },
];

test.describe("route states", () => {
  for (const c of cases) {
    test(c.name, async ({ page, api }) => {
      c.setup?.(api);
      api.expectedConsoleErrors = c.expectedConsoleErrors ?? [];
      await page.goto(c.url);
      await c.ready?.(page);
      for (const t of c.texts ?? []) {
        await expect(page.getByText(t).first()).toBeVisible();
      }
      await settle(page);

      await expect(page).toHaveTitle(c.title);
      // The old app never rewrites the URL on load (no redirects).
      expect(pathAndSearch(page)).toBe(c.finalUrl ?? c.url);
      const distinct = [...new Set(api.requests.map((r) => `${r.method} ${r.rawPath}`))].sort();
      expect(distinct).toEqual([...c.calls].sort());

      await expect(page).toHaveScreenshot(`${c.name}.png`, { fullPage: true, mask: c.mask?.(page) });
    });
  }
});
