import { createRef } from 'react';

export const navLinks = [
  {
    name: 'About',
    url: '/classic#about',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Experience',
    url: '/classic#jobs',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Work',
    url: '/classic#projects',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Contact',
    url: '/classic#contact',
    nodeRef: createRef<HTMLLIElement>(),
  },
];
