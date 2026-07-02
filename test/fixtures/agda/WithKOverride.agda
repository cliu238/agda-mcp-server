{-# OPTIONS --with-K #-}
module WithKOverride where
open import LibBase
open import Agda.Builtin.Equality
uip : {A : Set} {x y : A} (p q : x ≡ y) -> p ≡ q
uip refl refl = refl
