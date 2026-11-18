import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ApiProblem } from './models';

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return `Cannot reach the API at ${environment.apiBaseUrl}. Make sure the backend is running and allows this site's origin in its CORS policy.`;
    }

    if (error.status === 429) {
      return 'Too many attempts. Please wait a minute and try again.';
    }

    const problem = error.error as ApiProblem | null;
    if (problem?.errors && typeof problem.errors === 'object') {
      const first = Object.values(problem.errors)[0];
      if (Array.isArray(first) && first.length > 0) {
        return String(first[0]);
      }
    }

    if (problem?.detail) {
      return problem.detail;
    }

    if (problem?.title) {
      return problem.title;
    }

    return `Request failed (${error.status}).`;
  }

  return 'Something went wrong. Please try again.';
}
