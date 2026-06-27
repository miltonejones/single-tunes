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
  {
    path: 'podcasts',
    loadComponent: () => import('./podcast/podcast-shell').then((m) => m.PodcastShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./podcast/pages/podcast-home').then((m) => m.PodcastHomePage),
      },
      {
        path: 'search/:query',
        loadComponent: () => import('./podcast/pages/podcast-search').then((m) => m.PodcastSearchPage),
      },
      {
        path: 'detail/:feedUrl',
        loadComponent: () => import('./podcast/pages/podcast-detail').then((m) => m.PodcastDetailPage),
      },
      {
        path: 'subscriptions',
        loadComponent: () => import('./podcast/pages/podcast-subscriptions').then((m) => m.PodcastSubscriptionsPage),
      },
      {
        path: 'categories',
        loadComponent: () => import('./podcast/pages/podcast-categories').then((m) => m.PodcastCategoriesPage),
      },
    ],
  },
];
