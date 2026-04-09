function PageTransition({ routeKey, children }) {
  return (
    <div key={routeKey} className="page-transition">
      {children}
    </div>
  );
}

export default PageTransition;
