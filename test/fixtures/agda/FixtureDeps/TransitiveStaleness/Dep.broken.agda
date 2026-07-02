module FixtureDeps.TransitiveStaleness.Dep where

data Nat : Set where
  zero : Nat
  suc  : Nat -> Nat

data Bool : Set where
  true false : Bool

getValue : Bool
getValue = true
