import { parseProject, type BrandProject } from './project';
import { applyCommands, type DocumentCommand } from './commands';

export interface DocumentHistory {
  readonly current: BrandProject;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  execute(commands: DocumentCommand[]): BrandProject;
  undo(): BrandProject;
  redo(): BrandProject;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Only validated JSON document snapshots are retained. Asset bytes live outside this manifest. */
export function createHistory(project: BrandProject): DocumentHistory {
  let current = freeze(parseProject(project));
  const past: BrandProject[] = [], future: BrandProject[] = [];
  return {
    get current() { return current; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    execute(commands) {
      const next = freeze(applyCommands(current, commands));
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        past.push(current); current = next; future.length = 0;
      }
      return current;
    },
    undo() {
      const previous = past.pop();
      if (previous) { future.push(current); current = previous; }
      return current;
    },
    redo() {
      const next = future.pop();
      if (next) { past.push(current); current = next; }
      return current;
    },
  };
}
