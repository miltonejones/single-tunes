import { Routes } from '@angular/router';
import { homeResolver } from './pages/home/home.resolver';
import { gridResolver } from './pages/grid/grid.resolver';
import { listResolver } from './pages/list/list.resolver';
import { searchResolver } from './pages/search/search.resolver';
import { downloadsResolver } from './pages/downloads/downloads.resolver';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
    resolve: { home: homeResolver },
  },
  {
    path: 'list/:pageNum',
    loadComponent: () => import('./pages/list/list').then((m) => m.ListPage),
    resolve: { list: listResolver },
  },
  {
    path: 'list/:listType/:listId/:pageNum',
    loadComponent: () => import('./pages/list/list').then((m) => m.ListPage),
    resolve: { list: listResolver },
  },
  {
    path: 'grid/:gridType/:pageNum',
    loadComponent: () => import('./pages/grid/grid').then((m) => m.GridPage),
    resolve: { grid: gridResolver },
  },
  {
    path: 'search/:query',
    loadComponent: () => import('./pages/search/search').then((m) => m.SearchPage),
    resolve: { search: searchResolver },
  },
  {
    path: 'downloads',
    loadComponent: () => import('./pages/downloads/downloads').then((m) => m.DownloadsPage),
    resolve: { downloads: downloadsResolver },
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
