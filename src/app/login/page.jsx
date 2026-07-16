  'use strict';
  'use client';

  import './page.css';
  import { useState } from 'react';
  import { useRouter } from 'next/navigation';

  export default function Login() {
    const router = useRouter();
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (error) setError('');
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setSuccess('');

      const { username, password } = formData;

      if (!username.trim() || !password) {
        setError('Username and password are required.');
        return;
      }

      setLoading(true);

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Authentication failed. Please try again.');
          setLoading(false);
          return;
        }

        setSuccess('Logged in successfully! Redirecting to dashboard...');
        setFormData({ username: '', password: '' });

        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 1000);
      } catch (err) {
        console.error(err);
        setError('An error occurred. Please check your internet connection.');
        setLoading(false);
      }
    };

return (
  <div className="loginPage">
    <div className="loginBlob loginBlobOne" />
    <div className="loginBlob loginBlobTwo" />

    <div className="pageHeader">
      <h3 className="brandName">GREENTECH INDUSTRIES</h3>
      <p className="systemName">Officials Leave Management System</p>
    </div>

    <div className="loginContainer">
      <div className="loginShadowLayer" />
      <div className="loginCard">
        <div className="loginInnerPanel">
          <div className="accentBar" />

          {success && (
            <div className="loginAlert loginAlertSuccess">
              <span>{success}</span>
            </div>
          )}

          {error && (
            <div className="loginAlert loginAlertError">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="loginForm">
            <div className="loginField">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>

            <div className="loginField passwordField">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="********"
                disabled={loading}
              />
            </div>

            <button type="submit" disabled={loading} className="loginButton">
              {loading ? 'Logging in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
);
}