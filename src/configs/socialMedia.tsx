import IconGitHub from '@/assets/icons/github';
import IconLinkedin from '@/assets/icons/linkedin';
import { person } from '@/content/db';

export const email = person.email;

export const socialMedia = [
  {
    name: 'GitHub',
    icon: <IconGitHub />,
    url: person.github,
  },
  {
    name: 'Linkedin',
    icon: <IconLinkedin />,
    url: person.linkedin,
  },
];
