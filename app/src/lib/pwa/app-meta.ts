// EZD-013 Step 1 (vault/plans/EZD-013.md): app name and theme colour for the manifest and layout.
import { TOKENS } from '../../styles/tokens';

export const APP_NAME = 'EZ Draft';

const canvas = TOKENS.find((t) => t.name === '--ez-canvas');
if (!canvas) throw new Error('token --ez-canvas missing');

export const THEME_COLOR: string = canvas.value;
