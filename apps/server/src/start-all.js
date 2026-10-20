// Runs the API and the worker in ONE process - for hosts where a separate always-on worker
// isn't available (e.g. Render's free plan). Use `npm start` (API only) + the worker's own
// `npm start` when you can run them separately.
require("./index");
require("../../worker/src/index");
