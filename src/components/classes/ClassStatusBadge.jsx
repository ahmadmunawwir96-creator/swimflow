import React from 'react';
import { Badge } from '@/components/ui/badge';
import { classStatusLabel, classStatusStyle } from '@/lib/classFormat';

export default function ClassStatusBadge({ status }) {
  const value = status || 'scheduled';
  return <Badge className={classStatusStyle(value)}>{classStatusLabel(value)}</Badge>;
}