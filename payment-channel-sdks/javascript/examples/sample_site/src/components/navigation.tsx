import React, { useEffect, useState } from 'react';

import { useSignedAccountId, useWalletSelector } from '../near';
import { Link } from "react-router";
import '../styles/app.module.css';

// @ts-ignore
import NearLogo from '../assets/near-logo.svg';


export const Navigation = () => {
  const walletSelector = useWalletSelector();
  const signedAccountId = useSignedAccountId();

  return (
    <nav className="navbar navbar-expand-lg">
      <div className="container-fluid">
        <Link to="/">
          <img src={NearLogo} alt="NEAR" width="30" height="24" className="logo" />
        </Link>
        <div className="navbar-nav pt-1">
          {
            signedAccountId?.signedAccountId ? (
              <div className="d-flex gap-2">
                <a className="btn btn-secondary" href={`https://nearblocks.io/address/${signedAccountId.signedAccountId}`} target="_blank" rel="noopener noreferrer">Near Blocks Link</a>
                <button className="btn btn-secondary" onClick={async () => {
                  if (!walletSelector) return;
                  await walletSelector.signOut();
              }}>
                Logout: {signedAccountId.signedAccountId}
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={async () => {
                if (!walletSelector) return;
                await walletSelector.signIn();
              }}>
                Login
              </button>
            )
          }
        </div>
      </div>
    </nav>
  );
};
