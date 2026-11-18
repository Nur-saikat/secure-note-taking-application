import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'notes' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'notes',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/notes/notes').then((m) => m.NotesPage),
  },
  {
    path: 'posts',
    loadComponent: () => import('./pages/posts/posts').then((m) => m.PostsPage),
  },
  {
    path: 'users/:userId/posts',
    loadComponent: () => import('./pages/user-posts/user-posts').then((m) => m.UserPostsPage),
  },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-users/admin-users').then((m) => m.AdminUsersPage),
  },
  {
    path: 'admin/notes',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin-notes/admin-notes').then((m) => m.AdminNotesPage),
  },
  {
    path: 'admin/interests',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/interests/interests').then((m) => m.InterestsPage),
  },
  { path: '**', redirectTo: 'notes' },
];
