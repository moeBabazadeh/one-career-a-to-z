import { createRef } from 'react';

export const navLinks = [
  {
    name: 'About',
    url: '/#about',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Experience',
    url: '/#jobs',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Work',
    url: '/#projects',
    nodeRef: createRef<HTMLLIElement>(),
  },
  {
    name: 'Contact',
    url: '/#contact',
    nodeRef: createRef<HTMLLIElement>(),
  },
];
