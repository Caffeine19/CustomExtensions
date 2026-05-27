import { exec } from "child_process";
import { promisify } from "util";

export const promisifyExec = promisify(exec);
