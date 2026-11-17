// EZD-126 (11 Budgets "editor before its lazy parts 500 KB"; 11 rule 7): the editor's whole-page notices that a
// ready desktop editor never shows (the phone notice, no access) and the conflict banner, shown only while the open
// project has changes not saved; loaded when one is shown.
export { EditorPhoneNotice } from '../../components/phone/EditorPhoneNotice';
export { NoAccess } from '../../components/states/NoAccess';
export { ConflictBanner } from '../../editor/conflicts/ConflictBanner';
