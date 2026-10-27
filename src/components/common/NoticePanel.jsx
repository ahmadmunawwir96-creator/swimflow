import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Shared state panel for the class screens: loading, empty, error, access denied.
// Same visual language as the student directory notice.
export default function NoticePanel({ icon, title, description, actionLabel, onAction, loading }) {
  return (
    <Card>
      <CardContent className="py-12 px-6 text-center space-y-3">
        {loading ? (
          <div className="flex justify-center">
            <div className="h-7 w-7 rounded-full border-4 border-border border-t-brand animate-spin" />
          </div>
        ) : (
          icon && <div className="flex justify-center text-brand">{icon}</div>
        )}
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>}
        {actionLabel && onAction && (
          <Button size="sm" variant="outline" onClick={onAction}>{actionLabel}</Button>
        )}
      </CardContent>
    </Card>
  );
}