// Ported 1:1 from COMPASS (app/src/lib/taskCard.ts).
// A task card in a message is stored as "[[task:<uuid>]]" inside the text (~/maintenance_tool/docs/messaging.md "Task cards"). The card
// shows what the reader may see of the task: the database decides through the row policy of tasks_overview.
export const TASK_TOKEN = /\[\[task:([0-9a-fA-F-]{36})\]\]/g;

export const taskToken = (id: string) => `[[task:${id}]]`;
