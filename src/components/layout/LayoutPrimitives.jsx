function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export function Container({ className = '', children }) {
  return <div className={joinClasses('section-wrap w-full', className)}>{children}</div>;
}

export function Section({ as: Component = 'section', className = '', containerClassName = '', children }) {
  return (
    <Component className={joinClasses('w-full py-8 sm:py-10 lg:py-12', className)}>
      <Container className={containerClassName}>{children}</Container>
    </Component>
  );
}

export function Grid({ className = '', children }) {
  return <div className={joinClasses('grid min-w-0', className)}>{children}</div>;
}
