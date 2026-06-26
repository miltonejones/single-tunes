import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { ServiceWorkerUpdateService } from 'shared-utils';

bootstrapApplication(App, appConfig)
  .then((appRef) => appRef.injector.get(ServiceWorkerUpdateService).register())
  .catch((err) => console.error(err));
