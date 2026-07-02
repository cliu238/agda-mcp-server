module FixtureDeps.TransitiveStaleness.Dep where

data Nat : Set where
  zero : Nat
  suc  : Nat -> Nat

getValue : Nat
getValue = suc zero
