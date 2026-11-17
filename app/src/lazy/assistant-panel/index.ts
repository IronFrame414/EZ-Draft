// EZD-227 Build (11 Budgets "editor before its lazy parts 500 KB"; ARCH Entry points and lazy modules; EZD-234
// conflict panel precedent): the assistant panel, loaded through lazyModule when the assistant is first opened.
export { AssistantPanel } from '../../editor/assistant/AssistantPanel';
// EZD-5604b (EZD-120c B11): the Assistant session, made when the rail button is first pressed.
export { createAssistantSession } from '../../editor/assistant/assistant-session';
// EZD-5604b: the Assistant preview layer; a preview opens only after a send from the panel, so this module is
// already loaded when it is wanted.
export { PreviewLayer } from '../../editor/assistant/PreviewLayer';
