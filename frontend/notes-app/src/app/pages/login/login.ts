import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/errors';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly expired = this.route.snapshot.queryParamMap.has('expired');
  readonly error = signal('');
  readonly loading = signal(false);

  model = { username: '', password: '' };

  get demoCredentials(): boolean {
    return !this.auth.isLoggedIn();
  }

  submit(form: NgForm): void {
    if (form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.model.username, this.model.password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/notes']);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }
}
