import { rmSync } from "node:fs";

rmSync(".test-dist", {
    recursive: true,
    force: true,
});
