export type Highlight = {
  id: string;
  page: number;
  text: string;
  comment: string;
};

export type Paper = {
  id: string;
  cite: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  status: "Reading" | "Read" | "To read";
  tags: string[];
  color: string;
  summary: string;
  note: string;
  highlights: Highlight[];
  pdfUrl?: string;
  fileName?: string;
  imported?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  color: string;
};

export type PaperLink = {
  id: string;
  sourcePaperId: string;
  targetPaperId: string;
  relation: string;
  detail: string;
};

export type WorkingNote = {
  id: string;
  paperId: string;
  title: string;
  body: string;
  position: number;
};

export type PaperMetadataOverride = {
  authors: string;
  year: number;
  journal: string;
  summary: string;
};

export type PdfMetadataSuggestion = {
  authors?: string;
  year?: number;
};

export type LibraryState = {
  workspaces: Workspace[];
  memberships: Record<string, string[]>;
  hiddenPaperIds: string[];
  highlights: Record<string, Highlight[]>;
  favoritePaperIds: string[];
  recentPaperIds: string[];
  paperAliases: Record<string, string>;
  paperLinks: PaperLink[];
  metadataOverrides: Record<string, PaperMetadataOverride>;
};
