import { useState, useEffect } from 'react';

export const useUser = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Simulate fetching user data.  Replace with your actual authentication logic.
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      // Simulate login
      const newUser = {
        id: 'anonymous',
        firstName: 'Anonymous',
      };
      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
    }
  }, []);

  return { user };
};
