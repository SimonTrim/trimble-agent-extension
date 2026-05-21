export type ToolArgs = Record<string, unknown>;

export const isToolArgs = (value: unknown): value is ToolArgs =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseToolArgs = (args: unknown): ToolArgs => {
  if (!args) return {};
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  return isToolArgs(parsed) ? parsed : {};
};

export const stringifyToolResult = (result: unknown): string =>
  JSON.stringify(result, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );

export const toolSuccess = (data: ToolArgs = {}): string =>
  stringifyToolResult({ success: true, ...data });

export const toolError = (error: unknown): string =>
  stringifyToolResult({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });

export const requireExplicitConfirmation = (
  args: unknown,
  actionLabel: string
): { parsedArgs: ToolArgs; confirmationError?: string } => {
  const parsedArgs = parseToolArgs(args);

  if (parsedArgs.confirmed !== true) {
    return {
      parsedArgs,
      confirmationError: stringifyToolResult({
        success: false,
        requiresConfirmation: true,
        action: actionLabel,
        message: `Action sensible bloquée: ${actionLabel}. Demandez une confirmation claire à l'utilisateur, puis rappelez l'outil avec confirmed=true.`,
      }),
    };
  }

  return { parsedArgs };
};
