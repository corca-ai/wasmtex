export const DEFAULT_ALGEBRA = `%% ============================================================
\\section{Algebra}
\\label{sec:algebra}
%% ============================================================

\\subsection{Groups}

\\begin{definition}
A \\emph{group} is a set $G$ together with a binary operation
$\\cdot : G \\times G \\to G$ satisfying:
\\begin{enumerate}
  \\item \\textbf{Associativity:}
    $(a \\cdot b) \\cdot c = a \\cdot (b \\cdot c)$
    for all $a, b, c \\in G$.
  \\item \\textbf{Identity:} There exists $e \\in G$ such that
    $e \\cdot a = a \\cdot e = a$ for all $a \\in G$.
  \\item \\textbf{Inverses:} For each $a \\in G$, there exists
    $a^{-1} \\in G$ with $a \\cdot a^{-1} = a^{-1} \\cdot a = e$.
\\end{enumerate}
If additionally $a \\cdot b = b \\cdot a$ for all $a, b$,
the group is called \\emph{abelian}.
\\end{definition}

\\begin{theorem}[Lagrange]
\\label{thm:lagrange}
If $H$ is a subgroup of a finite group $G$, then $|H|$
divides $|G|$.
\\end{theorem}

\\begin{proof}
The left cosets of $H$ in $G$ partition $G$ into disjoint
subsets, each of size $|H|$. If there are $k$ distinct
cosets, then $|G| = k \\cdot |H|$, so $|H| \\mid |G|$.
\\end{proof}

\\begin{corollary}
By Theorem~\\ref{thm:lagrange}, the order of any element
$g \\in G$ divides $|G|$.
\\end{corollary}

\\subsection{Rings and Fields}

\\begin{definition}
A \\emph{ring} $(R, +, \\cdot)$ is an abelian group under $+$
with an associative multiplication that distributes over
addition. A \\emph{field} is a commutative ring in which every
nonzero element has a multiplicative inverse.
\\end{definition}

\\begin{example}
$\\mathbb{Z}$ is a ring but not a field.
$\\mathbb{Q}$, $\\mathbb{R}$, and $\\mathbb{C}$ are fields.
The integers modulo a prime $p$, denoted
$\\mathbb{Z}/p\\mathbb{Z}$ or $\\mathbb{F}_p$, form a finite
field with $p$ elements.
\\end{example}

\\subsection{Polynomials}

The roots of $ax^2 + bx + c = 0$ are given by the quadratic formula:
\\begin{equation}
\\label{eq:quadratic}
  x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}.
\\end{equation}

For the depressed cubic $x^3 + px + q = 0$, Cardano's formula yields:
\\begin{equation}
  x = \\sqrt[3]{-\\frac{q}{2} + \\sqrt{\\frac{q^2}{4} + \\frac{p^3}{27}}}
    + \\sqrt[3]{-\\frac{q}{2} - \\sqrt{\\frac{q^2}{4} + \\frac{p^3}{27}}}.
\\end{equation}

The discriminant $\\Delta = b^2 - 4ac$ in
Equation~\\eqref{eq:quadratic} determines the nature of
the roots:
\\[
\\text{roots} =
\\begin{cases}
  \\text{two distinct real} & \\text{if } \\Delta > 0, \\\\
  \\text{one repeated real}  & \\text{if } \\Delta = 0, \\\\
  \\text{two complex conjugates} & \\text{if } \\Delta < 0.
\\end{cases}
\\]
`

export const DEFAULT_ANALYSIS = `%% ============================================================
\\section{Real and Complex Analysis}
\\label{sec:analysis}
%% ============================================================

\\subsection{Sequences and Series}

\\begin{definition}
A sequence $(a_n)$ \\emph{converges} to $L$ if for every
$\\varepsilon > 0$ there exists $N$ such that $|a_n - L| < \\varepsilon$
for all $n > N$. We write $\\lim_{n \\to \\infty} a_n = L$.
\\end{definition}

Several important series:
\\begin{align}
  \\sum_{n=0}^{\\infty} x^n &= \\frac{1}{1-x},
    \\quad |x| < 1 \\label{eq:geometric} \\\\
  \\sum_{n=0}^{\\infty} \\frac{x^n}{n!} &= e^x
    \\label{eq:exp} \\\\
  \\sum_{n=1}^{\\infty} \\frac{1}{n^2}
    &= \\frac{\\pi^2}{6}
    \\label{eq:basel} \\\\
  \\sum_{n=1}^{\\infty} \\frac{(-1)^{n+1}}{n}
    &= \\ln 2
    \\label{eq:altharmonic}
\\end{align}
The geometric series~\\eqref{eq:geometric} converges for
$|x|<1$, while~\\eqref{eq:exp} converges everywhere.
The Basel series~\\eqref{eq:basel} was solved by Euler, and
the alternating harmonic series~\\eqref{eq:altharmonic}
follows from the Taylor expansion of $\\ln(1+x)$.

\\subsection{Differentiation and Integration}

Taylor's theorem with Lagrange remainder:
\\begin{equation}
\\label{eq:taylor}
  f(x) = \\sum_{k=0}^{n} \\frac{f^{(k)}(a)}{k!}(x-a)^k
    + \\frac{f^{(n+1)}(c)}{(n+1)!}(x-a)^{n+1}
\\end{equation}
for some $c$ between $a$ and $x$.
Equation~\\eqref{eq:taylor} is the backbone of local
approximation theory.

The Gaussian integral:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}.
\\end{equation}

Integration by parts:
\\begin{equation}
  \\int_a^b u\\,dv = \\bigl[uv\\bigr]_a^b - \\int_a^b v\\,du.
\\end{equation}

\\begin{theorem}[Fundamental Theorem of Calculus]
If $f$ is continuous on $[a,b]$ and $F$ is any antiderivative
of $f$, then
\\[
  \\int_a^b f(x)\\,dx = F(b) - F(a).
\\]
\\end{theorem}

\\subsection{Complex Analysis}

Euler's formula connects the exponential and trigonometric
functions:
\\begin{equation}
  e^{i\\theta} = \\cos\\theta + i\\sin\\theta.
\\end{equation}

Setting $\\theta = \\pi$ yields Euler's identity:
$e^{i\\pi} + 1 = 0$.

\\begin{theorem}[Cauchy's Integral Formula]
Let $f$ be holomorphic inside and on a simple closed contour
$\\gamma$, and let $z_0$ be interior to $\\gamma$. Then
\\[
  f(z_0) = \\frac{1}{2\\pi i}
    \\oint_{\\gamma} \\frac{f(z)}{z - z_0}\\,dz.
\\]
\\end{theorem}

\\begin{theorem}[Residue Theorem]
If $f$ is meromorphic inside $\\gamma$ with isolated
singularities $z_1, \\ldots, z_n$, then
\\[
  \\oint_{\\gamma} f(z)\\,dz
    = 2\\pi i \\sum_{k=1}^{n} \\operatorname{Res}(f, z_k).
\\]
\\end{theorem}
`

export const DEFAULT_LINALG = `%% ============================================================
\\section{Linear Algebra}
\\label{sec:linalg}
%% ============================================================

\\subsection{Matrices and Determinants}

A $2 \\times 2$ matrix and its determinant:
\\[
  A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}, \\qquad
  \\det(A) = ad - bc.
\\]

For a general $n \\times n$ matrix, the determinant can be
computed via cofactor expansion:
\\begin{equation}
  \\det(A) = \\sum_{j=1}^{n} (-1)^{i+j}\\, a_{ij}\\, M_{ij}
\\end{equation}
where $M_{ij}$ is the $(i,j)$-minor.

\\subsection{Eigenvalues and Diagonalization}

The eigenvalue equation $A\\mathbf{v} = \\lambda\\mathbf{v}$
leads to the characteristic polynomial
\\begin{equation}
  p(\\lambda) = \\det(A - \\lambda I) = 0.
\\end{equation}

\\begin{theorem}[Spectral Theorem]
Every real symmetric matrix $A$ can be diagonalized by an
orthogonal matrix: $A = Q\\Lambda Q^T$, where $\\Lambda$ is
diagonal and $Q$ is orthogonal.
\\end{theorem}

\\subsection{Matrix Decompositions}

Table~\\ref{tab:decompositions} summarizes the most important
matrix decompositions.

\\begin{table}[ht]
\\centering
\\caption{Common matrix decompositions}
\\label{tab:decompositions}
\\footnotesize
\\begin{tabular}{@{}llll@{}}
\\hline
\\textbf{Name} & \\textbf{Form} & \\textbf{Cond.} & \\textbf{Use} \\\\
\\hline
LU       & $A = LU$          & square  & solve \\\\
QR       & $A = QR$          & any     & LSQ  \\\\
SVD      & $A = U\\Sigma V^T$ & any     & rank \\\\
Cholesky & $A = LL^T$        & SPD     & sample \\\\
Schur    & $A = QTQ^*$       & square  & eig. \\\\
\\hline
\\end{tabular}
\\end{table}

\\subsection{Singular Value Decomposition}

\\begin{theorem}[SVD]
Every $m \\times n$ matrix $A$ can be factored as
\\[
  A = U \\Sigma V^T
\\]
where $U \\in \\mathbb{R}^{m \\times m}$ and
$V \\in \\mathbb{R}^{n \\times n}$ are orthogonal, and
$\\Sigma \\in \\mathbb{R}^{m \\times n}$ is diagonal with
non-negative entries $\\sigma_1 \\geq \\sigma_2 \\geq \\cdots \\geq 0$.
\\end{theorem}

The matrix 2-norm equals $\\sigma_1$, and the rank of $A$
equals the number of nonzero singular values.
`

export const DEFAULT_TEX = `\\documentclass[10pt,twocolumn]{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsthm}
\\emergencystretch=1em

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{corollary}[theorem]{Corollary}
\\newtheorem{proposition}[theorem]{Proposition}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}

\\title{A Survey of Fundamental Mathematics\\\\[4pt]
  \\large From Algebra to Topology}
\\author{Browser \\LaTeX{} Editor}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This document provides a broad survey of fundamental areas
in mathematics, ranging from algebra and analysis to
probability, combinatorics, and topology. It serves as both
a reference for key results and a demonstration of diverse
\\LaTeX{} typesetting features: theorems and proofs, multi-line
equations, tables, nested lists, cross-references, and more.
The material is organized into self-contained sections, each
introducing definitions, stating central theorems, and
providing illustrative examples.
\\end{abstract}

\\tableofcontents

\\newpage

%% ============================================================
\\section{Introduction}
\\label{sec:intro}
%% ============================================================

Mathematics is built on a hierarchy of abstractions. At the
base lie logic and set theory; above them rise algebra,
analysis, geometry, and topology. This survey touches on
several of these pillars, emphasizing results that recur
across disciplines.

We assume familiarity with basic notation: $\\mathbb{N}$
(natural numbers), $\\mathbb{Z}$ (integers), $\\mathbb{Q}$
(rationals), $\\mathbb{R}$ (reals), and $\\mathbb{C}$
(complex numbers). Sets are denoted by capital letters,
functions by lowercase letters, and operators by Greek
letters where conventional.

The reader may navigate this document using SyncTeX:
click on any line in the PDF to jump to the corresponding
source, or press Cmd/Ctrl+Enter in the editor to highlight
the matching region in the PDF.

For a comprehensive treatment of algebra, see
Artin~\\cite{artin}; for analysis, Rudin~\\cite{rudin};
for linear algebra, Axler~\\cite{axler}.
Hardy and Wright~\\cite{hardywright} cover number theory,
Feller~\\cite{feller} covers probability,
Stanley~\\cite{stanley} treats combinatorics,
Munkres~\\cite{munkres} is the standard topology reference,
and Strauss~\\cite{strauss} introduces PDEs.

Section~\\ref{sec:algebra} covers algebraic structures.
Section~\\ref{sec:analysis} treats real and complex analysis.
Section~\\ref{sec:linalg} discusses linear algebra.
Section~\\ref{sec:numtheory} explores number theory.
Section~\\ref{sec:probability} introduces probability.
Section~\\ref{sec:combinatorics} surveys combinatorics.
Section~\\ref{sec:topology} outlines point-set topology.
Section~\\ref{sec:diffeq} addresses differential equations.
We conclude in Section~\\ref{sec:conclusion}.

\\input{algebra}
\\input{analysis}
\\input{linalg}

%% ============================================================
\\section{Number Theory}
\\label{sec:numtheory}
%% ============================================================

\\subsection{Divisibility and Primes}

\\begin{theorem}[Fundamental Theorem of Arithmetic]
Every integer $n \\geq 2$ has a unique factorization
\\[
  n = p_1^{a_1} p_2^{a_2} \\cdots p_k^{a_k}
\\]
with primes $p_1 < p_2 < \\cdots < p_k$ and positive
exponents $a_i$.
\\end{theorem}

Key results in elementary number theory:
\\begin{enumerate}
  \\item \\textbf{Fermat's Little Theorem.}
    If $p$ is prime and $\\gcd(a,p)=1$, then
    $a^{p-1} \\equiv 1 \\pmod{p}$.
  \\item \\textbf{Wilson's Theorem.}
    $p > 1$ is prime iff $(p-1)! \\equiv -1 \\pmod{p}$.
  \\item \\textbf{Euler's Totient.}
    $\\phi(n) = n \\prod_{p \\mid n}
    (1 - 1/p)$.
  \\item \\textbf{CRT.}
    If $\\gcd(m,n) = 1$, the system
    $x \\equiv a \\pmod{m}$,
    $x \\equiv b \\pmod{n}$
    has a unique solution mod~$mn$.
\\end{enumerate}

\\subsection{Distribution of Primes}

The prime counting function $\\pi(x)$ satisfies the
\\emph{Prime Number Theorem}:
\\begin{equation}
  \\pi(x) \\sim \\frac{x}{\\ln x}
    \\quad \\text{as } x \\to \\infty.
\\end{equation}

A more precise estimate involves the logarithmic integral:
\\begin{equation}
  \\pi(x) \\sim \\operatorname{Li}(x)
    = \\int_2^x \\frac{dt}{\\ln t}.
\\end{equation}

Table~\\ref{tab:primes} compares $\\pi(x)$ with its
approximations for selected values.

\\begin{table}[ht]
\\centering
\\caption{$\\pi(x)$ vs.\\ approximations}
\\label{tab:primes}
\\footnotesize
\\begin{tabular}{@{}rrrr@{}}
\\hline
$x$ & $\\pi(x)$ & $x/\\!\\ln x$ & $\\mathrm{Li}(x)$ \\\\
\\hline
$10^3$ & 168   & 145   & 178   \\\\
$10^4$ & 1229  & 1086  & 1246  \\\\
$10^6$ & 78498 & 72382 & 78628 \\\\
\\hline
\\end{tabular}
\\end{table}

\\subsection{The Riemann Zeta Function}

The Riemann zeta function is defined for $\\operatorname{Re}(s)>1$ by
\\begin{equation}
  \\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s}
    = \\prod_{p \\text{ prime}} \\frac{1}{1 - p^{-s}}.
\\end{equation}

The \\emph{Riemann Hypothesis} asserts that all non-trivial
zeros of $\\zeta(s)$ have real part $\\frac{1}{2}$.
Selected values:
\\begin{gather}
  \\zeta(2) = \\frac{\\pi^2}{6}, \\qquad
  \\zeta(4) = \\frac{\\pi^4}{90}, \\qquad
  \\zeta(6) = \\frac{\\pi^6}{945}, \\\\
  \\zeta(-1) = -\\frac{1}{12} \\quad
    \\text{(by analytic continuation)}.
\\end{gather}

%% ============================================================
\\section{Probability and Statistics}
\\label{sec:probability}
%% ============================================================

\\subsection{Foundations}

\\begin{definition}
A \\emph{probability space} is a triple
$(\\Omega, \\mathcal{F}, P)$ where $\\Omega$ is the sample
space, $\\mathcal{F}$ is a $\\sigma$-algebra of events, and
$P : \\mathcal{F} \\to [0,1]$ is a probability measure
with $P(\\Omega) = 1$.
\\end{definition}

\\subsection{Discrete Distributions}

Table~\\ref{tab:discrete} lists common discrete distributions.

\\begin{table}[ht]
\\centering
\\caption{Discrete distributions}
\\label{tab:discrete}
\\footnotesize
\\begin{tabular}{@{}llll@{}}
\\hline
\\textbf{Dist.} & \\textbf{Mean}
  & \\textbf{Var.} \\\\
\\hline
Bern.($p$)   & $p$        & $p(1\\!-\\!p)$ \\\\
Binom.($n,p$)& $np$       & $np(1\\!-\\!p)$ \\\\
Pois.($\\lambda$) & $\\lambda$ & $\\lambda$ \\\\
Geom.($p$)   & $1/p$      & $(1\\!-\\!p)/p^2$ \\\\
\\hline
\\end{tabular}
\\end{table}

\\subsection{Continuous Distributions}

For a continuous random variable $X$ with density $f$:
\\begin{align}
  E[X] &= \\int_{-\\infty}^{\\infty} x\\,f(x)\\,dx, \\\\
  \\operatorname{Var}(X) &= E[X^2] - (E[X])^2, \\\\
  M_X(t) &= E[e^{tX}]
    = \\int_{-\\infty}^{\\infty} e^{tx} f(x)\\,dx.
\\end{align}

The normal (Gaussian) density:
\\begin{equation}
  f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}
    \\exp\\!\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right).
\\end{equation}

\\subsection{Limit Theorems}

\\begin{theorem}[Law of Large Numbers]
Let $X_1, X_2, \\ldots$ be i.i.d.\\ with mean $\\mu$ and
finite variance. Then $\\bar{X}_n \\to \\mu$ in probability.
\\end{theorem}

\\begin{theorem}[Central Limit Theorem]
\\label{thm:clt}
Under the same conditions,
\\[
  \\frac{\\bar{X}_n - \\mu}{\\sigma / \\sqrt{n}}
  \\xrightarrow{d} \\mathcal{N}(0,1).
\\]
\\end{theorem}

\\begin{remark}
The CLT (Theorem~\\ref{thm:clt}) explains why the normal
distribution appears so frequently in practice: any
quantity that arises as the sum of many small independent
effects tends to be approximately normal.
\\end{remark}

%% ============================================================
\\section{Combinatorics}
\\label{sec:combinatorics}
%% ============================================================

\\subsection{Counting Principles}

\\begin{itemize}
  \\item \\textbf{Addition principle:} If $A$ and $B$ are
    disjoint finite sets, $|A \\cup B| = |A| + |B|$.
  \\item \\textbf{Multiplication principle:}
    $|A \\times B| = |A| \\cdot |B|$.
  \\item \\textbf{Inclusion--exclusion:}
    \\[
      |A \\cup B| = |A| + |B| - |A \\cap B|.
    \\]
  \\item \\textbf{Pigeonhole principle:} If $n$ items are
    placed into $m$ containers with $n > m$, at least one
    container holds more than one item.
\\end{itemize}

\\subsection{Binomial Coefficients}

The binomial theorem:
\\begin{equation}
  (x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^k y^{n-k}
\\end{equation}
where $\\binom{n}{k} = \\frac{n!}{k!(n-k)!}$.

Key identities:
\\begin{gather}
  \\binom{n}{k} = \\binom{n}{n-k}
    \\quad \\text{(symmetry)} \\\\
  \\binom{n}{k} = \\binom{n-1}{k-1} + \\binom{n-1}{k}
    \\quad \\text{(Pascal)} \\\\
  \\sum_{k=0}^{n} \\binom{n}{k} = 2^n, \\quad
  \\sum_{k=0}^{n} \\binom{n}{k}^2 = \\binom{2n}{n}
\\end{gather}

\\subsection{Generating Functions}

The \\emph{ordinary generating function} for a sequence
$(a_n)$ is $A(x) = \\sum_{n \\geq 0} a_n x^n$.

\\begin{example}
The Fibonacci numbers $F_0 = 0$, $F_1 = 1$,
$F_n = F_{n-1} + F_{n-2}$ have the generating function
\\[
  F(x) = \\frac{x}{1 - x - x^2}.
\\]
The closed form (Binet's formula) is
\\[
  F_n = \\frac{\\varphi^n - \\psi^n}{\\sqrt{5}}
\\]
where $\\varphi = (1+\\sqrt{5})/2$ and
$\\psi = (1-\\sqrt{5})/2$.
\\end{example}

\\subsection{The Catalan Numbers}

\\begin{definition}
The $n$-th Catalan number is
\\begin{equation}
  C_n = \\frac{1}{n+1}\\binom{2n}{n}
      = \\frac{(2n)!}{(n+1)!\\,n!}.
\\end{equation}
\\end{definition}

The first several values are:
$C_0 = 1$, $C_1 = 1$, $C_2 = 2$, $C_3 = 5$,
$C_4 = 14$, $C_5 = 42$, $C_6 = 132$.

Catalan numbers count many combinatorial objects:
\\begin{enumerate}
  \\item The number of valid sequences of $n$ pairs of
    parentheses.
  \\item The number of rooted binary trees with $n+1$
    leaves.
  \\item The number of ways to triangulate a convex
    $(n+2)$-gon.
  \\item The number of monotone lattice paths from
    $(0,0)$ to $(n,n)$ that do not cross the diagonal.
\\end{enumerate}

%% ============================================================
\\section{Point-Set Topology}
\\label{sec:topology}
%% ============================================================

\\subsection{Topological Spaces}

\\begin{definition}
A \\emph{topological space} is a pair $(X, \\tau)$ where
$\\tau \\subseteq \\mathcal{P}(X)$ satisfies:
\\begin{enumerate}
  \\item $\\varnothing, X \\in \\tau$.
  \\item $\\tau$ is closed under arbitrary unions.
  \\item $\\tau$ is closed under finite intersections.
\\end{enumerate}
The elements of $\\tau$ are called \\emph{open sets}.
\\end{definition}

\\begin{definition}
A function $f : X \\to Y$ between topological spaces is
\\emph{continuous} if $f^{-1}(U) \\in \\tau_X$ for every
$U \\in \\tau_Y$.
\\end{definition}

\\subsection{Compactness}

\\begin{definition}
A space $X$ is \\emph{compact} if every open cover has a
finite subcover.
\\end{definition}

\\begin{theorem}[Heine--Borel]
A subset of $\\mathbb{R}^n$ is compact if and only if it
is closed and bounded.
\\end{theorem}

\\begin{theorem}[Tychonoff]
An arbitrary product of compact spaces is compact (in the
product topology).
\\end{theorem}

\\subsection{Connectedness}

\\begin{definition}
A space $X$ is \\emph{connected} if it cannot be written as
$X = U \\cup V$ with $U, V$ disjoint nonempty open sets.
It is \\emph{path-connected} if for every $x, y \\in X$
there exists a continuous path $\\gamma : [0,1] \\to X$
with $\\gamma(0) = x$ and $\\gamma(1) = y$.
\\end{definition}

\\begin{proposition}
Path-connectedness implies connectedness. The converse is
false in general, but holds for open subsets of
$\\mathbb{R}^n$.
\\end{proposition}

\\subsection{Metric Spaces}

\\begin{definition}
A \\emph{metric space} $(X,d)$ consists of a set $X$ and a
function $d : X \\times X \\to [0,\\infty)$ satisfying:
\\begin{enumerate}
  \\item $d(x,y) = 0 \\iff x = y$
    \\quad (identity of indiscernibles).
  \\item $d(x,y) = d(y,x)$ \\quad (symmetry).
  \\item $d(x,z) \\leq d(x,y) + d(y,z)$
    \\quad (triangle inequality).
\\end{enumerate}
\\end{definition}

\\begin{theorem}[Banach Fixed Point]
Let $(X,d)$ be a complete metric space and
$T : X \\to X$ a contraction mapping, i.e.,
$d(T(x),T(y)) \\leq c\\, d(x,y)$ for some $c < 1$.
Then $T$ has a unique fixed point $x^* = T(x^*)$.
\\end{theorem}

%% ============================================================
\\section{Differential Equations}
\\label{sec:diffeq}
%% ============================================================

\\subsection{Ordinary Differential Equations}

A first-order ODE has the form $y' = f(x, y)$.
For separable equations $y' = g(x)h(y)$:
\\[
  \\int \\frac{dy}{h(y)} = \\int g(x)\\,dx.
\\]

\\begin{example}
The logistic equation $y' = ry(1 - y/K)$ has solution
\\begin{equation}
  y(t) = \\frac{K}{1 + \\left(\\frac{K}{y_0} - 1\\right) e^{-rt}}.
\\end{equation}
\\end{example}

The general second-order linear ODE with constant
coefficients:
\\begin{equation}
  ay'' + by' + cy = 0
\\end{equation}
has the characteristic equation $ar^2 + br + c = 0$.
Let $\\Delta = b^2 - 4ac$. The solution depends on
the sign of $\\Delta$:
\\[
y =
\\begin{cases}
  C_1 e^{r_1 x} + C_2 e^{r_2 x}
    & \\Delta > 0 \\\\[4pt]
  (C_1 + C_2 x) e^{rx}
    & \\Delta = 0 \\\\[4pt]
  e^{\\alpha x}(C_1 \\cos\\beta x
    + C_2 \\sin\\beta x)
    & \\Delta < 0
\\end{cases}
\\]
where $\\alpha = -b/(2a)$,
$\\beta = \\sqrt{-\\Delta}/(2a)$.

\\subsection{Partial Differential Equations}

Three classical PDEs and their physical interpretations:

\\begin{enumerate}
  \\item \\textbf{Heat equation} (diffusion):
    \\begin{equation}
      \\frac{\\partial u}{\\partial t}
        = k \\frac{\\partial^2 u}{\\partial x^2}
    \\end{equation}

  \\item \\textbf{Wave equation} (vibration):
    \\begin{equation}
      \\frac{\\partial^2 u}{\\partial t^2}
        = c^2 \\frac{\\partial^2 u}{\\partial x^2}
    \\end{equation}

  \\item \\textbf{Laplace equation} (steady state):
    \\begin{equation}
      \\frac{\\partial^2 u}{\\partial x^2}
        + \\frac{\\partial^2 u}{\\partial y^2} = 0
    \\end{equation}
\\end{enumerate}

\\begin{theorem}[Fourier Series Solution]
The heat equation on $[0, L]$ with homogeneous
boundary conditions has solutions
\\[
  u(x,t) = \\sum_{n=1}^{\\infty} B_n
    \\sin\\!\\tfrac{n\\pi x}{L}\\;
    e^{-k(n\\pi/L)^2 t}
\\]
where $f(x) = u(x,0)$ is the initial condition
and $B_n = \\frac{2}{L} \\int_0^L
  f(x)\\sin\\tfrac{n\\pi x}{L}\\,dx$.
\\end{theorem}

%% ============================================================
\\section{Conclusion}
\\label{sec:conclusion}
%% ============================================================

As outlined in Section~\\ref{sec:intro}, this survey has
covered fundamental results across eight areas of
mathematics:

\\begin{enumerate}
  \\item \\textbf{Algebra} (Section~\\ref{sec:algebra}):
    groups, rings, fields, and polynomial equations.
  \\item \\textbf{Analysis} (Section~\\ref{sec:analysis}):
    series, calculus, and complex function theory.
  \\item \\textbf{Linear Algebra} (Section~\\ref{sec:linalg}):
    eigenvalues, SVD, and matrix decompositions.
  \\item \\textbf{Number Theory} (Section~\\ref{sec:numtheory}):
    primes, congruences, and the zeta function.
  \\item \\textbf{Probability} (Section~\\ref{sec:probability}):
    distributions, the LLN, and the CLT.
  \\item \\textbf{Combinatorics}
    (Section~\\ref{sec:combinatorics}):
    counting, generating functions, and Catalan numbers.
  \\item \\textbf{Topology} (Section~\\ref{sec:topology}):
    open sets, compactness, and metric spaces.
  \\item \\textbf{Differential Equations}
    (Section~\\ref{sec:diffeq}):
    ODEs, PDEs, and Fourier solutions.
\\end{enumerate}

Each section merely scratches the surface of its subject;
the interested reader is directed to the references for
comprehensive treatments.

\\bibliographystyle{plain}
\\bibliography{refs}

\\end{document}
`

export const DEFAULT_REFS_BIB = `@book{artin,
  author    = {Michael Artin},
  title     = {Algebra},
  edition   = {2nd},
  publisher = {Pearson},
  year      = {2011}
}

@book{rudin,
  author    = {Walter Rudin},
  title     = {Principles of Mathematical Analysis},
  edition   = {3rd},
  publisher = {McGraw-Hill},
  year      = {1976}
}

@book{axler,
  author    = {Sheldon Axler},
  title     = {Linear Algebra Done Right},
  edition   = {3rd},
  publisher = {Springer},
  year      = {2015},
  series    = {Undergraduate Texts in Mathematics}
}

@book{hardywright,
  author    = {G. H. Hardy and E. M. Wright},
  title     = {An Introduction to the Theory of Numbers},
  edition   = {6th},
  publisher = {Oxford University Press},
  year      = {2008}
}

@book{feller,
  author    = {William Feller},
  title     = {An Introduction to Probability Theory and Its Applications},
  volume    = {1},
  edition   = {3rd},
  publisher = {Wiley},
  year      = {1968}
}

@book{stanley,
  author    = {Richard P. Stanley},
  title     = {Enumerative Combinatorics},
  volume    = {1},
  edition   = {2nd},
  publisher = {Cambridge University Press},
  year      = {2012}
}

@book{munkres,
  author    = {James R. Munkres},
  title     = {Topology},
  edition   = {2nd},
  publisher = {Pearson},
  year      = {2000}
}

@book{strauss,
  author    = {Walter A. Strauss},
  title     = {Partial Differential Equations: An Introduction},
  edition   = {2nd},
  publisher = {Wiley},
  year      = {2007}
}
`
