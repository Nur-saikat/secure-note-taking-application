import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/errors';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly loading = signal(false);

  model = {
    username: '',
    email: '',
    password: '',
    confirm: '',
    interests: '',
  };

  submit(form: NgForm): void {
    if (form.invalid || this.loading()) {
      return;
    }

    if (this.model.password !== this.model.confirm) {
      this.error.set('Passwords do not match.');
      return;
    }

    const interests = this.model.interests
      .split(',')
      .map((interest) => interest.trim().toLowerCase())
      .filter((interest) => interest.length > 0);

    const uniqueInterests = [...new Set(interests)];
    if (uniqueInterests.length > 20) {
      this.error.set('Please use at most 20 interests.');
      return;
    }

    if (uniqueInterests.some((interest) => interest.length > 30)) {
      this.error.set('Each interest must be at most 30 characters.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth
      .register({
        username: this.model.username,
        email: this.model.email,
        password: this.model.password,
        interests: uniqueInterests,
      })
      .subscribe({
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
