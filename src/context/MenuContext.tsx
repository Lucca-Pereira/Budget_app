import React from 'react';

export const MenuContext = React.createContext<{openMenu: () => void}>({
  openMenu: () => {},
});
