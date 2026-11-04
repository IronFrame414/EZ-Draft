// EZD-286 Step 2 (vault/plans/EZD-286.md D3): node:test exits 0 when a `describe` before or after hook
// fails (probed on Node 22.23.3). This reporter sets exit code 1 on every `test:fail` event whose
// failureType is 'hookFailed' and writes one line per event; other events are ignored. It yields only the
// hook lines, so run it with the tap reporter on stdout and this one on stderr.
export default async function* hookFailReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue;
    const { data } = event;
    const error = data.details?.error;
    if (error?.failureType !== 'hookFailed') continue;
    process.exitCode = 1;
    yield `hook failure: ${data.file} > ${data.name}: ${error.cause?.message ?? error.message}\n`;
  }
}
