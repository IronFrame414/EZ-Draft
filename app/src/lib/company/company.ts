// EZD-112 Step 9 (vault/plans/EZD-112.md Decided "Size limit", "Type from name", "`checkLogoFile` order",
// "Draft restore"; S15a Validation): the company identity types and logo file rules shared by the browser
// and the server. No React, no Supabase.

export const LOGO_MAX_BYTES = 5_000_000;
export const LOGO_KINDS = ['png', 'jpg', 'svg'] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

export const LOGO_CONTENT_TYPES: Record<LogoKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
};

export function logoKindFromName(name: string): LogoKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'svg') return 'svg';
  return null;
}

export type LogoProblem = 'logo_wrong_type' | 'logo_too_large';

export function checkLogoFile(file: { name: string; size: number }): LogoProblem | null {
  if (logoKindFromName(file.name) === null) return 'logo_wrong_type';
  if (file.size > LOGO_MAX_BYTES) return 'logo_too_large';
  return null;
}

export const CONTACT_KEYS = ['phone', 'email', 'website', 'address'] as const;
export type CompanyContact = Partial<Record<(typeof CONTACT_KEYS)[number], string>>;

export type CompanyLogo = { path: string; url: string; kind: LogoKind };

export type CompanyData = {
  name: string;
  licenseNo: string | null;
  contact: CompanyContact;
  logo: CompanyLogo | null;
};

export type LogoChange =
  { action: 'keep' } | { action: 'set'; path: string } | { action: 'remove' };

export type CompanyUpdate = {
  name: string;
  licenseNo: string | null;
  contact: CompanyContact;
  logo: LogoChange;
};

export type CompanyDraft = {
  fields: {
    name: string;
    licenseNo: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
  logo: LogoChange;
  staged: { path: string; kind: LogoKind; fileName: string; size: number } | null;
};

export type DraftLogo = {
  logoChange: LogoChange;
  staged: (CompanyLogo & { fileName: string; size: number }) | null;
  logoError: string | null;
};

const UPLOAD_FAILED = 'office.company.logo_upload_failed';

// Re-checks a restored draft's staged logo through the check route (Q-0352 (b)): the signed link expires
// after 900 s, so a fresh one is fetched; a refusal falls back to the saved logo.
export async function recheckDraftLogo(
  draft: CompanyDraft,
  check: (path: string) => Promise<Response>,
): Promise<DraftLogo> {
  if (draft.logo.action !== 'set') {
    return { logoChange: draft.logo, staged: null, logoError: null };
  }
  const path = draft.logo.path;
  const keep: LogoChange = { action: 'keep' };
  try {
    const res = await check(path);
    const body: unknown = await res.json().catch(() => null);
    if (res.status === 200) {
      const logo = (body as { logo?: CompanyLogo } | null)?.logo;
      if (!logo) return { logoChange: keep, staged: null, logoError: UPLOAD_FAILED };
      return {
        logoChange: { action: 'set', path },
        staged: {
          path: logo.path,
          url: logo.url,
          kind: logo.kind,
          fileName: draft.staged?.fileName ?? '',
          size: draft.staged?.size ?? 0,
        },
        logoError: null,
      };
    }
    if (res.status === 400) {
      const key = (body as { error?: { message_key?: unknown } } | null)?.error?.message_key;
      return {
        logoChange: keep,
        staged: null,
        logoError: typeof key === 'string' ? key : UPLOAD_FAILED,
      };
    }
    return { logoChange: keep, staged: null, logoError: UPLOAD_FAILED };
  } catch {
    return { logoChange: keep, staged: null, logoError: UPLOAD_FAILED };
  }
}
