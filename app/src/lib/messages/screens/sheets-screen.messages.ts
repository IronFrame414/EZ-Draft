// EZD-1995: the messages of the lazy screen "sheets-screen" (server/messages/screen-prefixes.ts). The app build replaces this
// file with the slice itself (app/tools/screen-messages-loader.cjs), so the whole catalog never reaches the browser;
// this source is what tests run.
import { screenSlice } from '../../../server/messages/screen-messages';

export default screenSlice('sheets-screen');
