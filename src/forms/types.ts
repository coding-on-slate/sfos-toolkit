export type FormField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  value: string;
  options?: Array<{ value: string; label: string }>;
};

export type FormDocument = {
  id: string;
  title: string;
  status?: string;
  readonly?: boolean;
  commit: "field" | "all";
  fields: FormField[];
};

export type FormHandler = {
  load: () => Promise<FormDocument>;
  commitField?(key: string, value: string): Promise<void>;
  commitAll?(values: Record<string, string>): Promise<void>;
};
