// Ported 1:1 from the NPM tool (app/src/pages/vessels/seawebExcelWorker.ts).
// Reads and maps the SeaWeb Excel export off the main thread: unzipping and XML-parsing ~180k rows takes tens of seconds
// and would freeze the page (read-excel-file's README recommends exactly this worker setup).
import { readSheet } from "read-excel-file/web-worker";
import { EMPTY_PARSE_RESULT, parseSeawebSheet, type SeawebParseResult } from "./seawebExcel";

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  let result: SeawebParseResult;
  try {
    result = parseSeawebSheet((await readSheet(event.data)) as unknown[][]);
  } catch (e) {
    result = { ...EMPTY_PARSE_RESULT, error: `Could not read the Excel file: ${(e as Error).message}` };
  }
  self.postMessage(result);
};
