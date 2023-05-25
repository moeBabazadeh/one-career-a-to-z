import React from 'react';
import Side from '@/components/Side';
import { email } from '@/configs/socialMedia';

const Email = () => (
  <Side orientation="right">
    <div className="link-wrapper">
      <a href={`mailto:${email}`}>{email}</a>
    </div>
  </Side>
);

export default Email;
