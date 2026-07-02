module FixtureDeps.TransitiveStaleness.Main where

open import FixtureDeps.TransitiveStaleness.Dep

_+_ : Nat -> Nat -> Nat
zero  + n = n
suc m + n = suc (m + n)

useValue : Nat
useValue = getValue
