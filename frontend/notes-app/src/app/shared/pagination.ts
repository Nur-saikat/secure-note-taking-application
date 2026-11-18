import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  template: `
    @if (total() > 0) {
      <nav class="pagination" aria-label="Pagination">
        <button
          type="button"
          [disabled]="page() <= 1"
          (click)="go(page() - 1)"
          aria-label="Previous page"
        >
          &larr; Previous
        </button>
        <span class="pager-info">
          <strong>Page {{ page() }}</strong> of {{ totalPages() }} &middot; {{ total() }} total
        </span>
        <button
          type="button"
          [disabled]="page() >= totalPages()"
          (click)="go(page() + 1)"
          aria-label="Next page"
        >
          Next &rarr;
        </button>
      </nav>
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  go(page: number): void {
    if (page >= 1 && page <= this.totalPages() && page !== this.page()) {
      this.pageChange.emit(page);
    }
  }
}
