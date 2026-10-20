import { forwardRef } from 'react';
import { tr } from '@/lib/i18n';
import { StackedTitle } from '@/components/StackedTitle';

/**
 * The Enterprise page's title: BLACKTOP / ENTERPRISE with the Coming soon pill
 * (components/StackedTitle). The pill is the stamp that pops when the
 * not-yet-open parts are tried (the forwarded ref).
 */
export const EnterpriseTitle = forwardRef<HTMLSpanElement>(function EnterpriseTitle(_, pillRef) {
  return <StackedTitle ref={pillRef} second={tr("Enterprise")} pill={tr("Coming soon").split(/\s+/).filter(Boolean)} label={tr("Blacktop Enterprise")} />;
});
