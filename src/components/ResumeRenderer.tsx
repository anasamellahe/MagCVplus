import React from 'react';
import Mustache from 'mustache';
// Template loaded at build; alternatively fetch via import.meta.glob
import templateHtml from './ResumeTemplate.html?raw';

interface Props { data: any; className?: string; }

export const ResumeRenderer: React.FC<Props> = ({ data, className }) => {
  const rendered = React.useMemo(() => {
    try { return Mustache.render(templateHtml, data || {}); } catch { return '<div>Template render error</div>'; }
  }, [data]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: rendered }} />;
};
