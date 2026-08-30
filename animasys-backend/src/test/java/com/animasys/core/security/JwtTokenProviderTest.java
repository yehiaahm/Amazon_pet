package com.animasys.core.security;

import com.animasys.modules.iam.domain.Employee;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

public class JwtTokenProviderTest {

    private JwtTokenProvider tokenProvider;

    @BeforeEach
    public void setUp() {
        tokenProvider = new JwtTokenProvider();
        ReflectionTestUtils.setField(tokenProvider, "jwtSecret", "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970");
        ReflectionTestUtils.setField(tokenProvider, "jwtExpirationMs", 86400000L);
    }

    @Test
    public void testTokenGenerationAndValidation() {
        Employee employee = Employee.builder()
                .id("e-1")
                .username("test_user")
                .fullName("Test User")
                .role("OWNER")
                .active(true)
                .build();
        UserPrincipal principal = new UserPrincipal(employee);

        Authentication authentication = Mockito.mock(Authentication.class);
        when(authentication.getPrincipal()).thenReturn(principal);

        String token = tokenProvider.generateToken(authentication);
        assertNotNull(token);

        assertTrue(tokenProvider.validateToken(token));
        assertEquals("test_user", tokenProvider.getUsernameFromJwt(token));
    }
}
