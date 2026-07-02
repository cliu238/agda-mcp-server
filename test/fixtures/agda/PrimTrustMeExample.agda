module PrimTrustMeExample where

open import Agda.Builtin.Equality
open import Agda.Builtin.Equality.Erase

unsafeCoerce : {A B : Set} → A ≡ B
unsafeCoerce = primTrustMe
