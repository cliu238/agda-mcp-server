module TerminatingExample where

open import Agda.Builtin.Nat

{-# TERMINATING #-}
countDown : Nat → Nat
countDown zero = zero
countDown (suc n) = countDown n
