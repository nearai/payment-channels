import React from 'react';
import { Navigation } from './components/navigation.jsx';
import Home from './pages/home.js';

import { SignedAccountIdProvider, WalletSelectorProvider, PaymentChannelClientProvider } from './near.tsx';

import { BrowserRouter, Routes, Route } from "react-router";

function App() {
  return (
    <SignedAccountIdProvider>
      <WalletSelectorProvider>
        <PaymentChannelClientProvider>
          <BrowserRouter>
            <Navigation />
            <Routes>
              <Route path="/" element={<Home />} />
            </Routes>
          </BrowserRouter>
        </PaymentChannelClientProvider>
      </WalletSelectorProvider>
    </SignedAccountIdProvider>
  )
}

export default App
