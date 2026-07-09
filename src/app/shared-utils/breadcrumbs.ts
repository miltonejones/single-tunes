import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  link?: readonly unknown[];
  icon?: string; // Font Awesome icon name, e.g. 'fa-house'
}

@Component({
  selector: 'lib-breadcrumbs',
  imports: [RouterLink],
  templateUrl: './breadcrumbs.html',
  styleUrl: './breadcrumbs.css',
})
export class Breadcrumbs {
  items = input<BreadcrumbItem[]>([]);
}
