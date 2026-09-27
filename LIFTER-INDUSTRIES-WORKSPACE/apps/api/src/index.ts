import { pathToFileURL } from "node:url";
import { app } from "./app.js";

export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env["PORT"] ?? 3001);
  app.listen(port, () => console.info(`API listening on port ${port}`));
}
