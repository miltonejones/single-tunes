import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'list/:pageNum',
    loadComponent: () => import('./pages/list/list').then((m) => m.ListPage),
  },
  {
    path: 'list/:listType/:listId/:pageNum',
    loadComponent: () => import('./pages/list/list').then((m) => m.ListPage),
  },
  {
    path: 'grid/:gridType/:pageNum',
    loadComponent: () => import('./pages/grid/grid').then((m) => m.GridPage),
  },
  {
    path: 'search/:query',
    loadComponent: () => import('./pages/search/search').then((m) => m.SearchPage),
  },
];
