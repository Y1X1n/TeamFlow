export interface FieldIssue {
  path: string;
  message: string;
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly errors?: FieldIssue[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
