{-# OPTIONS --without-K #-}
module LibBase where
open import Agda.Builtin.Equality
libLemma : {A : Set} {x y : A} -> x ≡ y -> y ≡ x
libLemma refl = refl
